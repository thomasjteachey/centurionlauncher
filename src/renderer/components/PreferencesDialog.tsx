import { Download, FolderPen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '~renderer/utils/api';
import {
        DEFAULT_LAUNCHER_UPDATE_URL,
        DEFAULT_REALMLIST,
        REALMLIST_PRESETS
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
        const [realmList, setRealmList] = useState('');

        useEffect(() => {
                setLauncherUpdateUrl(pref?.launcherUpdateUrl ?? DEFAULT_LAUNCHER_UPDATE_URL);
        }, [pref?.launcherUpdateUrl]);

        useEffect(() => {
                setRealmList(pref?.realmList ?? DEFAULT_REALMLIST);
        }, [pref?.realmList]);

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

        const persistRealmList = async (value?: string) => {
                const nextValue = (value ?? realmList).trim();
                if (!pref) return;
                if (!nextValue) {
                        setRealmList(pref.realmList);
                        return;
                }

                if (nextValue === pref.realmList) return;

                try {
                        const updated = await setPref.mutateAsync({
                                realmList: nextValue
                        });
                        setRealmList(updated.realmList);
                } catch (error) {
                        setRealmList(pref.realmList);
                        console.error(error);
                }
        };

        const inputClassName =
                'rounded border border-text bg-dark/60 p-2 text-sm text-text placeholder:text-textDark focus:border-primary focus:outline-none';

        const realmListPresets = Object.entries(REALMLIST_PRESETS);

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
                                        <span className="text-sm text-text">Realmlist server</span>
                                        <div className="flex flex-col gap-1">
                                                {realmListPresets.map(([id, preset]) => {
                                                        const checked = realmList === preset.host;
                                                        return (
                                                                <label
                                                                        key={id}
                                                                        className="flex items-center gap-2 text-sm text-text"
                                                                >
                                                                        <input
                                                                                type="radio"
                                                                                name="realm-list-preset"
                                                                                value={preset.host}
                                                                                checked={checked}
                                                                                onChange={() => {
                                                                                        setRealmList(preset.host);
                                                                                        void persistRealmList(preset.host);
                                                                                }}
                                                                        />
                                                                        <span className="flex flex-col leading-tight">
                                                                                <span>{preset.label}</span>
                                                                                <span className="text-xs text-textDark">
                                                                                        {preset.host}
                                                                                </span>
                                                                        </span>
                                                                </label>
                                                        );
                                                })}
                                        </div>
                                        <label htmlFor="realm-list-custom" className="text-sm text-text">
                                                Custom realmlist
                                        </label>
                                        <input
                                                id="realm-list-custom"
                                                className={inputClassName}
                                                value={realmList}
                                                onChange={event => setRealmList(event.target.value)}
                                                onBlur={() => {
                                                        void persistRealmList();
                                                }}
                                                onKeyDown={event => {
                                                        if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                event.currentTarget.blur();
                                                        }
                                                }}
                                                placeholder={DEFAULT_REALMLIST}
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
