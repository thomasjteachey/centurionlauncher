import cls from 'classnames';
import { useState, type ReactNode } from 'react';

import { REALMS, type RealmId } from '~common/constants';
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
                if (pref?.selectedRealm === realm) return;
                await setPref.mutateAsync({ selectedRealm: realm });
                await invalidate.mutateAsync();
        };

        return (
                <>
                        <p className="text-2xl">Select server:</p>
                        <div className="flex gap-2">
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
