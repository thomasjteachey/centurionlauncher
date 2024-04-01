import { api } from './utils/api';
import PageBackground from './assets/background.png';
import WoWLogo from './assets/logo.png';
import LaunchPanel from './components/LaunchPanel';
import TopBar from './components/TopBar';
import IconSpinner from './components/styled/IconSpinner';

const App = () => {
	const { isLoading } = api.preferences.get.useQuery();

	return (
		<div
			className="relative flex grow flex-col gap-3 overflow-hidden border border-textDark/10 bg-dark bg-cover bg-top bg-no-repeat p-[44px]"
			style={{ backgroundImage: `url(${PageBackground})` }}
		>
			<TopBar />

			{isLoading ? (
				<div className="flex flex-grow items-center justify-center">
					<IconSpinner />
				</div>
			) : (
				<>
					<div className="flex min-h-0 flex-grow flex-col items-center gap-3">
						<img src={WoWLogo} className="w-1/2" alt="Logo" />
						<h1 className="color text-4xl">CenturionWoW</h1>
					</div>
					<LaunchPanel />
				</>
			)}
		</div>
	);
};

export default App;
