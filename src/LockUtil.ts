const pool = {
  singleFlight: {},
  synchronized: {},
};
const LockUtil = {
  async singleFlight({ key, fn }: { key: string; fn?: Function }) {
    let lockObj = pool.singleFlight[key];

    if (!fn) {
      return lockObj?.lock;
    }

    if (!lockObj) {
      lockObj = {
        lock: null,
        resolve: null,
        reject: null,
      };
      pool.singleFlight[key] = lockObj;
    }
    if (lockObj.lock) {
      return lockObj.lock;
    }
    lockObj.lock = new Promise((resolve, reject) => {
      lockObj.resolve = resolve;
      lockObj.reject = reject;
    });
    try {
      const res = await fn();
      lockObj.resolve(res);
      return res;
    } catch (e) {
      lockObj.reject(e);
      throw e;
    } finally {
      delete lockObj.lock;
      delete lockObj.resolve;
      delete lockObj.reject;
      delete pool.singleFlight[key];
    }
  },
  async synchronized({ key, fn }: { key: string; fn: Function }) {
    let lockList: any[] = pool.synchronized[key];
    if (!lockList) {
      lockList = [];
      pool.synchronized[key] = lockList;
    }
    const lockObj = {
      lock: null,
      resolve: null,
      reject: null,
      fn,
    };
    lockObj.lock = new Promise((resolve, reject) => {
      lockObj.resolve = resolve;
      lockObj.reject = reject;
    });
    lockList.push(lockObj);
    if (lockList.length > 1) {
      return lockObj.lock;
    }

    const _r = async () => {
      const lockObj = lockList[0];
      if (!lockObj) {
        return;
      }
      try {
        const res = await lockObj.fn();
        lockObj.resolve(res);
      } catch (e) {
        lockObj.reject(e);
      } finally {
        const index = lockList.findIndex((item) => item.lock === lockObj.lock);
        if (index >= 0) {
          lockList.splice(index, 1);
        }
        _r().then();
      }
    };
    _r().then();

    return lockObj.lock;
  },
};

export default LockUtil;
