import { useForm } from 'react-hook-form';
import { useEffect } from 'react';

import { PreferencesSchema } from '~common/schemas';
import zodResolver from '~renderer/utils/zodResolver';
import { api } from '~renderer/utils/api';

import TextButton from './styled/TextButton';
import FilePickerInput from './form/FilePickerInput';
import CloseButton from './styled/CloseButton';

type Props = { close: () => void };

const ClientDirDialog = ({ close }: Props) => {
	const { data: pref } = api.preferences.get.useQuery();
	const setPref = api.preferences.set.useMutation();

	const verify = api.updater.verify.useMutation();

	const {
		register,
		handleSubmit,
		watch,
		formState,
		setValue,
		setError,
		reset
	} = useForm({
		defaultValues: pref ?? {},
		resolver: zodResolver(PreferencesSchema)
	});

	// Form reset
	useEffect(() => {
		pref && reset(pref);
	}, [reset, pref]);

	return (
		<form
			className="dialog"
			onSubmit={handleSubmit(async v => {
				try {
					await setPref.mutateAsync(v);
					await verify.mutateAsync();
					close();
				} catch (e) {
					setError('clientDir', {
						message: e instanceof Error ? e.message : JSON.stringify(e)
					});
				}
			})}
		>
			<CloseButton
				close={() => {
					reset();
					close();
				}}
			/>
			<h2 className="color mb-2 text-xl">Install location</h2>

			<p>Locate your WoW Wrath of the Lich King client directory.</p>
			<div className="flex items-center gap-3">
				<label htmlFor="clientDir">Install directory:</label>
				<FilePickerInput
					{...register('clientDir')}
					title={watch('clientDir') ?? undefined}
					setValue={v =>
						setValue('clientDir', v, {
							shouldTouch: true,
							shouldDirty: true,
							shouldValidate: true
						})
					}
					options={{ properties: ['openDirectory', 'createDirectory'] }}
				/>
			</div>
			{formState.errors.clientDir && (
				<p className="text-sm text-secondary">
					{formState.errors.clientDir.message}
				</p>
			)}

			<TextButton
				type="submit"
				loading={formState.isSubmitting}
				className="text-green self-end"
			>
				Confirm
			</TextButton>
		</form>
	);
};

export default ClientDirDialog;
