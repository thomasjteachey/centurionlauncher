import path from 'path';

import fs from 'fs-extra';
import { type z } from 'zod';
import { app } from 'electron';

import { PreferencesSchema } from '~common/schemas';

import Logger from './logger';

abstract class Preferences {
	static default = PreferencesSchema.parse({});
	private static _data: z.infer<typeof PreferencesSchema>;

	static userDataDir = app.getPath('userData');

	private static async load() {
		const userDataPath = path.join(this.userDataDir, 'settings.json');

		try {
			if (!(await fs.exists(userDataPath))) return this.default;
			const json = await fs.readJSON(userDataPath);
			return PreferencesSchema.parse(json);
		} catch (e) {
			Logger.log('Failed to load settings.json', 'error', e);
			return this.default;
		}
	}

	public static async read() {
		if (!this._data) this._data = await this.load();
		return this._data;
	}

	public static async write(
		newData: Partial<z.infer<typeof PreferencesSchema>>
	) {
		if (newData.clientDir) {
			const exists = await fs.exists(path.join(newData.clientDir, 'WoW.exe'));
			if (!exists)
				throw new Error('Invalid client directory. WoW.exe not found.');
		}

		if (!this._data) this._data = await this.load();

		this._data = { ...this._data, ...newData };

		await fs.writeJSON(
			path.join(this.userDataDir, 'settings.json'),
			this._data,
			{ spaces: 2 }
		);
	}
}

export default Preferences;
