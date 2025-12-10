import Observable from './observable';

export type UpdaterStatus = {
        state: 'idle';
        message?: string;
        progress?: number;
};

class UpdaterClass extends Observable<UpdaterStatus> {
        protected _value: UpdaterStatus = { state: 'idle' };

        invalidate() {
                this._notifyObservers();
                return this._value;
        }

        verify() {
                this._notifyObservers();
                return Promise.resolve(this._value);
        }

        update() {
                this._notifyObservers();
                return Promise.resolve(this._value);
        }

        observe() {
                return super.observe();
        }

        clearObservers() {
                super.clearObservers();
        }

        async ensureRealmPatchesFor(_realmId: string) {
                return Promise.resolve();
        }
}

export const isGameRunning = async () => false;

const Updater = new UpdaterClass();
export default Updater;
