import { useState, type ReactElement } from 'react';
import cls from 'classnames';

import { type UpdaterStatus } from '~main/types';
import { api } from '~renderer/utils/api';

import Button from './styled/Button';
import DialogButton from './styled/DialogButton';
import ClientDirDialog from './ClientDirDialog';

const LaunchPanel = () => {
	const [status, setStatus] = useState<UpdaterStatus>({ state: 'verifying' });
	api.updater.observe.useSubscription(undefined, {
		onData: data => setStatus(data)
	});

        const verify = api.updater.verify.useMutation();
        const update = api.updater.update.useMutation();
        const start = api.launcher.start.useMutation();
        const closeLauncher = api.updater.closeLauncher.useMutation();

	const props: Record<
		UpdaterStatus['state'],
		{ button: ReactElement; helperText?: ReactElement }
	> = {
                needsValidation: {
                        button: <Button onClick={() => verify.mutateAsync()}>Verify</Button>,
                        helperText: (
                                <div className="space-y-1">
					<p>New changes detected</p>
					<p className="text-xs text-textDark">Please verify your game data</p>
				</div>
			)
		},
		verifying: { button: <Button disabled>Verifying</Button> },
                serverUnreachable: {
                        button: <Button onClick={() => verify.mutateAsync()}>Retry</Button>,
                        helperText: (
                                <div className="space-y-1">
					<p>
						<span className="text-secondary">Error: </span> Failed to reach
						update server
					</p>
					<p className="text-xs text-textDark">Please try again later</p>
				</div>
			)
		},
                noClient: {
                        button: (
				<DialogButton
					clickAway
					dialog={close => <ClientDirDialog close={close} />}
				>
					{open => (
						<Button primary onClick={open}>
							Locate client
						</Button>
					)}
				</DialogButton>
			),
                        helperText: (
                                <div className="space-y-1">
					<p>Client location was not yet selected</p>
					<p className="text-xs text-textDark">
						Please select your World of Warcraft 3.3.5 location
					</p>
				</div>
			)
		},
                updateAvailable: {
                        button: <Button onClick={() => update.mutateAsync()}>Update</Button>,
                        helperText: (
                                <div className="space-y-1">
					<p>Update available!</p>
					<p className="text-xs text-textDark">
						With total download size{' '}
						<span className="text-xs text-text">{status.message}</span>
					</p>
				</div>
			)
		},
                updating: { button: <Button disabled>Updating</Button> },
                upToDate: {
                        button: (
                                <Button primary onClick={() => start.mutateAsync()}>
                                        Play
                                </Button>
			),
                        helperText: (
                                <div className="space-y-1">
					<p>Everything up to date!</p>
				</div>
			)
		},
                failed: {
                        button: <Button onClick={() => verify.mutateAsync()}>Retry</Button>,
                        helperText: (
                                <div className="space-y-1">
                                        <p>
                                                <span className="text-secondary">Error: </span>
                                                {status.message}
                                        </p>
                                        <p className="text-xs text-textDark">
                                                Verify your game data by clicking Retry.
                                        </p>
                                </div>
                        )
                }
        };

        const base = props[status.state];
        let helper = base.helperText;
        let button = base.button;

        const launcher = status.launcher;
        if (launcher?.state === 'downloading') {
                button = <Button disabled>Updating launcher</Button>;
                helper = (
                        <div className="space-y-1">
                                <p>Launcher update in progress.</p>
                                {launcher.message && (
                                        <p className="text-xs text-textDark">{launcher.message}</p>
                                )}
                        </div>
                );
        } else if (launcher?.state === 'pendingClose') {
                button = (
                        <Button
                                primary
                                disabled={closeLauncher.isLoading}
                                onClick={() => closeLauncher.mutateAsync()}
                        >
                                Close
                        </Button>
                );
                helper = (
                        <div className="space-y-1">
                                <p>Launcher update downloaded.</p>
                                <p className="text-xs text-textDark">
                                        {launcher.message ?? 'Please close the launcher to finish updating.'}
                                </p>
                        </div>
                );
        } else if (launcher?.state === 'applying') {
                button = <Button disabled>Closing...</Button>;
                helper = (
                        <div className="space-y-1">
                                <p>Closing to apply launcher update...</p>
                        </div>
                );
        }

        const progressValue =
                launcher?.state === 'downloading'
                        ? launcher.progress
                        : launcher?.state === 'pendingClose'
                                ? 1
                                : launcher?.state === 'applying'
                                        ? -1
                                        : status.progress;

        const progressMessage = launcher?.message ?? status.message;

        return (
                <div className="flex gap-3">
                        <div className="flex flex-grow select-none flex-col justify-end gap-2">
                                <div className="flex flex-col gap-1 pb-1">
                                        {helper ??
                                                (progressMessage && (
                                                        <p className="text-xs">{progressMessage}</p>
                                                ))}
                                        {status.notice && (
                                                <p className="text-xs text-secondary">{status.notice}</p>
                                        )}
                                </div>
                                <div className="loading-wrapper">
                                        {progressValue !== undefined && (
                                                <div
                                                        className={cls('loading', {
                                                                'loading-unknown': progressValue === -1
                                                        })}
                                                        style={
                                                                progressValue !== -1
                                                                        ? {
                                                                                        clipPath: `inset(0 ${
                                                                                                100 - Math.ceil(Math.abs(progressValue) * 100)
                                                                                        }% 0 0)`
                                                                          }
                                                                        : undefined
                                                        }
                                                />
                                        )}
                                </div>
                        </div>
                        {button}
                </div>
        );
};

export default LaunchPanel;
