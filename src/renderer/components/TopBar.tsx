import { Menu } from 'lucide-react';

import TextButton from './styled/TextButton';

const TopBar = () => (
        <div className="flex justify-end p-4">
                <TextButton icon={Menu} title="Settings" onClick={() => undefined} className="!p-1" />
        </div>
);

export default TopBar;
