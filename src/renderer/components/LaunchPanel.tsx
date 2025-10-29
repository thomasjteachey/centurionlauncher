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
        const restartLauncher = api.updater.restartLauncher.useMutation();

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
                launcherUpdating: {
                        button: <Button disabled>Updating launcher</Button>
                },
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
                },
                launcherRestartPending: {
                        button: (
                                <Button primary onClick={() => restartLauncher.mutateAsync()}>
                                        Restart now
                                </Button>
                        ),
                        helperText: (
                                <div className="space-y-1">
                                        <p>Launcher update downloaded.</p>
                                        <p className="text-xs text-textDark">
                                                Please restart the launcher to finish updating.
                                        </p>
                                </div>
                        )
                }
        };

        const helper = props[status.state].helperText;

        return (
                <div className="flex gap-3">
                        <div className="flex flex-grow select-none flex-col justify-end gap-2">
                                <div className="flex flex-col gap-1 pb-1">
                                        {helper ??
                                                (status.message && (
                                                        <p className="text-xs">{status.message}</p>
                                                ))}
                                        {status.notice && (
                                                <p className="text-xs text-secondary">{status.notice}</p>
                                        )}
                                </div>
                                <div className="loading-wrapper">
                                        {status.progress !== undefined && (
                                                <div
							className={cls('loading', {
								'loading-unknown': status.progress === -1
							})}
							style={
								status.progress !== -1
									? {
											clipPath: `inset(0 ${
												100 - Math.ceil(Math.abs(status.progress) * 100)
											}% 0 0)`
									  }
									: undefined
							}
						/>
					)}
				</div>
			</div>
			{props[status.state].button}
		</div>
	);
};

export default LaunchPanel;
