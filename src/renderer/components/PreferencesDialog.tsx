import { Download, FolderPen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '~renderer/utils/api';
import {
        DEFAULT_LAUNCHER_UPDATE_URL,
        REALMLIST_DEFAULTS,
        REALMS
} from '~common/constants';

import TextButton from './styled/TextButton';
import CheckboxInput from './form/CheckboxInput';
import DialogButton from './styled/DialogButton';
import ClientDirDialog from './ClientDirDialog';
import CloseButton from './styled/CloseButton';

type Props = { close: () => void };

const PreferencesDialog = ({ close }: Props) => {
        const { data: pref } = api.preferences.get.useQuery();
        const setPref = api.preferences.set.useMutation();

        const update = api.updater.update.useMutation();

        const [launcherUpdateUrl, setLauncherUpdateUrl] = useState('');
        const [legionnaireRealmList, setLegionnaireRealmList] = useState('');
        const [azerothcoreRealmList, setAzerothcoreRealmList] = useState('');

        useEffect(() => {
                setLauncherUpdateUrl(pref?.launcherUpdateUrl ?? DEFAULT_LAUNCHER_UPDATE_URL);
        }, [pref?.launcherUpdateUrl]);

        useEffect(() => {
                setLegionnaireRealmList(
                        pref?.realmListLegionnaire ?? REALMLIST_DEFAULTS.legionnaire
                );
        }, [pref?.realmListLegionnaire]);

        useEffect(() => {
                setAzerothcoreRealmList(
                        pref?.realmListAzerothcore ?? REALMLIST_DEFAULTS.azerothcore
                );
        }, [pref?.realmListAzerothcore]);

        const persistLauncherUpdateUrl = async () => {
                const trimmed = launcherUpdateUrl.trim();
                if (!pref) return;
                if (!trimmed) {
                        setLauncherUpdateUrl(pref.launcherUpdateUrl);
                        return;
                }

                if (trimmed === pref.launcherUpdateUrl) return;

                try {
                        const updated = await setPref.mutateAsync({
                                launcherUpdateUrl: trimmed
                        });
                        setLauncherUpdateUrl(updated.launcherUpdateUrl);
                } catch (error) {
                        setLauncherUpdateUrl(pref.launcherUpdateUrl);
                        console.error(error);
                }
        };

        const persistLegionnaireRealmList = async () => {
                if (!pref) return;

                const trimmed = legionnaireRealmList.trim();
                if (!trimmed) {
                        setLegionnaireRealmList(pref.realmListLegionnaire);
                        return;
                }

                if (trimmed === pref.realmListLegionnaire) return;

                const shouldUpdateActiveRealm =
                        REALMS[pref.selectedRealm]?.realmListKey === 'legionnaire';

                try {
                        const updated = await setPref.mutateAsync({
                                realmListLegionnaire: trimmed,
                                ...(shouldUpdateActiveRealm ? { realmList: trimmed } : {})
                        });
                        setLegionnaireRealmList(updated.realmListLegionnaire);
                } catch (error) {
                        setLegionnaireRealmList(pref.realmListLegionnaire);
                        console.error(error);
                }
        };

        const persistAzerothcoreRealmList = async () => {
                if (!pref) return;

                const trimmed = azerothcoreRealmList.trim();
                if (!trimmed) {
                        setAzerothcoreRealmList(pref.realmListAzerothcore);
                        return;
                }

                if (trimmed === pref.realmListAzerothcore) return;

                const shouldUpdateActiveRealm =
                        REALMS[pref.selectedRealm]?.realmListKey === 'azerothcore';

                try {
                        const updated = await setPref.mutateAsync({
                                realmListAzerothcore: trimmed,
                                ...(shouldUpdateActiveRealm ? { realmList: trimmed } : {})
                        });
                        setAzerothcoreRealmList(updated.realmListAzerothcore);
                } catch (error) {
                        setAzerothcoreRealmList(pref.realmListAzerothcore);
                        console.error(error);
                }
        };

        const inputClassName =
                'rounded border border-text bg-dark/60 p-2 text-sm text-text placeholder:text-textDark focus:border-primary focus:outline-none';

        return (
                <div className="dialog">
                        <CloseButton close={close} />
                        <h2 className="color mb-2 text-xl">Settings</h2>

			<div className="flex w-full flex-col">
				<h3 className="color text-lg">Game</h3>
				<div className="flex w-full items-center gap-2 pl-2">
					<span className="shrink-0">Install directory:</span>
					<span
						title={pref?.clientDir}
						className="min-w-0 shrink grow overflow-hidden text-ellipsis text-textDark"
					>
						{pref?.clientDir ? pref?.clientDir : 'Not selected'}
					</span>
					<DialogButton
						dialog={close => <ClientDirDialog close={close} />}
						clickAway={pref?.isPortable}
					>
						{open => (
							<TextButton icon={FolderPen} onClick={open}>
								Change
							</TextButton>
						)}
					</DialogButton>
				</div>
                                <CheckboxInput
                                        value={pref?.cleanWdb ?? false}
                                        setValue={v => setPref.mutateAsync({ cleanWdb: v })}
                                        label="Clean WDB on each launch"
                                />
                                <div className="mt-3 flex flex-col gap-2 pl-2">
                                        <span className="text-sm text-text">Realmlist servers</span>
                                        <label htmlFor="realm-list-azerothcore" className="text-sm text-text">
                                                AzerothCore realmlist
                                        </label>
                                        <input
                                                id="realm-list-azerothcore"
                                                className={inputClassName}
                                                value={azerothcoreRealmList}
                                                onChange={event => setAzerothcoreRealmList(event.target.value)}
                                                onBlur={() => {
                                                        void persistAzerothcoreRealmList();
                                                }}
                                                onKeyDown={event => {
                                                        if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                event.currentTarget.blur();
                                                        }
                                                }}
                                                placeholder={REALMLIST_DEFAULTS.azerothcore}
                                        />
                                        <label htmlFor="realm-list-legionnaire" className="text-sm text-text">
                                                Legionnaire realmlist
                                        </label>
                                        <input
                                                id="realm-list-legionnaire"
                                                className={inputClassName}
                                                value={legionnaireRealmList}
                                                onChange={event => setLegionnaireRealmList(event.target.value)}
                                                onBlur={() => {
                                                        void persistLegionnaireRealmList();
                                                }}
                                                onKeyDown={event => {
                                                        if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                event.currentTarget.blur();
                                                        }
                                                }}
                                                placeholder={REALMLIST_DEFAULTS.legionnaire}
                                        />
                                </div>
                        </div>

                        <div className="flex flex-col">
                                <h3 className="color text-lg">Launcher</h3>
                                <CheckboxInput
					value={pref?.reopenLauncher ?? false}
					setValue={v => setPref.mutateAsync({ reopenLauncher: v })}
					label="Reopen launcher after WoW closes"
				/>
                                <CheckboxInput
                                        value={pref?.rememberPosition ?? false}
                                        setValue={v => setPref.mutateAsync({ rememberPosition: v })}
                                        label="Remember position & size of launcher window"
                                />
                                <div className="mt-3 flex flex-col gap-1 pl-2">
                                        <label
                                                htmlFor="launcher-update-url"
                                                className="text-sm text-text"
                                        >
                                                Launcher update server
                                        </label>
                                        <input
                                                id="launcher-update-url"
                                                className={inputClassName}
                                                value={launcherUpdateUrl}
                                                onChange={event =>
                                                        setLauncherUpdateUrl(event.target.value)
                                                }
                                                onBlur={persistLauncherUpdateUrl}
                                                onKeyDown={event => {
                                                        if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                event.currentTarget.blur();
                                                        }
                                                }}
                                                placeholder={DEFAULT_LAUNCHER_UPDATE_URL}
                                        />
                                        <span className="text-xs text-textDark">
                                                Changing this will automatically recheck for launcher updates.
                                        </span>
                                </div>
                                <TextButton
                                        icon={Download}
                                        onClick={() => {
                                                close();
                                                update.mutateAsync(true);
					}}
				>
					Force update
				</TextButton>
			</div>
		</div>
	);
};

export default PreferencesDialog;
