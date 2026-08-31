import https from 'node:https';
import net from 'node:net';

import fetch, { type RequestInit } from 'node-fetch';

import { DEFAULT_LAUNCHER_UPDATE_URL } from '~common/constants';

const canonicalUpdateHostname = new URL(DEFAULT_LAUNCHER_UPDATE_URL).hostname;
const directIpAgent = new https.Agent({
	// A LAN client can connect straight to the update server's IP without DNS,
	// while TLS still authenticates the hostname named by its public certificate.
	// Do not replace this with rejectUnauthorized: false.
	servername: canonicalUpdateHostname
});

/**
 * Fetch an update resource. HTTPS URLs that use a literal IP connect to that IP
 * but use the canonical update hostname for SNI and certificate verification.
 */
const updateFetch = (url: string, init?: RequestInit) => {
	const parsedUrl = new URL(url);
	const agent =
		parsedUrl.protocol === 'https:' && net.isIP(parsedUrl.hostname)
			? directIpAgent
			: init?.agent;

	return fetch(url, { ...init, agent });
};

export default updateFetch;
