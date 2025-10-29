import { useState } from 'react';

import { REALMS, type RealmId } from '~common/constants';
import { api } from '~renderer/utils/api';

const RealmSwitch = () => {
        const { data: pref } = api.preferences.get.useQuery();
        const setPref = api.preferences.set.useMutation();

        const invalidate = api.updater.invalidate.useMutation();

        const [isLoading, setIsLoading] = useState(false);
        api.updater.observe.useSubscription(undefined, {
                onData: data =>
                        setIsLoading(
                                data.state === 'verifying' ||
                                        data.state === 'updating' ||
                                        data.launcher?.state === 'downloading' ||
                                        data.launcher?.state === 'pendingClose' ||
                                        data.launcher?.state === 'applying'
                        )
        });

        const onSelect = async (realm: RealmId) => {
                if (isLoading) return;
                if (pref?.selectedRealm === realm) return;
                await setPref.mutateAsync({ selectedRealm: realm });
                await invalidate.mutateAsync();
        };

        return (
                <>
                        <p className="text-2xl">Select server:</p>
                        <div className="flex">
                                <select
                                        className="w-full rounded border border-dark bg-dark p-3 text-lg uppercase text-text"
                                        value={pref?.selectedRealm ?? ''}
                                        onChange={event => onSelect(event.target.value as RealmId)}
                                        disabled={isLoading}
                                >
                                        <option value="" disabled hidden>
                                                Select a realm
                                        </option>
                                        {Object.entries(REALMS).map(([id, meta]) => (
                                                <option key={id} value={id}>
                                                        {meta.label}
                                                </option>
                                        ))}
                                </select>
                        </div>
                </>
        );
};

export default RealmSwitch;
