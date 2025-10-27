import cls from 'classnames';
import { useState, type ReactNode } from 'react';

import {
        REALMLIST_DEFAULTS,
        REALMS,
        type RealmId,
        type RealmListKey
} from '~common/constants';
import type { PreferencesSchema } from '~common/schemas';
import { api } from '~renderer/utils/api';

type LargeButtonProps = {
	active?: boolean;
	loading?: boolean;
	onClick?: () => void;
	children: ReactNode;
};

const LargeButton = ({
	active,
	loading,
	onClick,
	children
}: LargeButtonProps) => (
	<button
		type="button"
		onClick={onClick}
		className={cls(
			'rounded border bg-dark p-4 text-xl uppercase',
			active ? 'color' : 'text-textDark',
			loading && 'pointer-events-none opacity-50'
		)}
	>
		{children}
	</button>
);

const getRealmListHost = (
        pref: PreferencesSchema | undefined,
        key: RealmListKey
) => {
        switch (key) {
                case 'azerothcore':
                        return pref?.realmListAzerothcore ?? REALMLIST_DEFAULTS.azerothcore;
                case 'legionnaire':
                default:
                        return pref?.realmListLegionnaire ?? REALMLIST_DEFAULTS.legionnaire;
        }
};

const RealmSwitch = () => {
        const { data: pref } = api.preferences.get.useQuery();
        const setPref = api.preferences.set.useMutation();

        const invalidate = api.updater.invalidate.useMutation();

        const [isLoading, setIsLoading] = useState(false);
        api.updater.observe.useSubscription(undefined, {
                onData: data =>
                        setIsLoading(data.state === 'verifying' || data.state === 'updating')
        });

        const onClick = async (realm: RealmId) => {
                if (isLoading) return;

                const targetRealmList = REALMS[realm]
                        ? getRealmListHost(pref, REALMS[realm].realmListKey)
                        : undefined;
                const alreadySelected = pref?.selectedRealm === realm;
                const hasCorrectRealmList = pref?.realmList === targetRealmList;

                if (alreadySelected && hasCorrectRealmList) return;

                const payload: Partial<PreferencesSchema> = { selectedRealm: realm };

                if (!hasCorrectRealmList && targetRealmList) {
                        payload.realmList = targetRealmList;
                }

                await setPref.mutateAsync(payload);
                await invalidate.mutateAsync();
        };

        return (
                <>
                        <p className="text-2xl">Select server:</p>
                        <div className="flex flex-wrap gap-2">
                                {Object.entries(REALMS).map(([id, meta]) => (
                                        <LargeButton
                                                key={id}
                                                active={pref?.selectedRealm === id}
                                                loading={isLoading}
                                                onClick={() => onClick(id as RealmId)}
                                        >
                                                {meta.label}
                                        </LargeButton>
                                ))}
                        </div>
                </>
        );
};

export default RealmSwitch;
