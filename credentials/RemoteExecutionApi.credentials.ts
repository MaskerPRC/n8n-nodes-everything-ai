import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class RemoteExecutionApi implements ICredentialType {
	name = 'remoteExecutionApi';

	displayName = 'Remote Execution API';

	icon: Icon = { light: 'file:../icons/brain.svg', dark: 'file:../icons/brain.dark.svg' };

	documentationUrl = 'https://github.com/MaskerPRC/n8n-nodes-everything-ai';

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'string',
			default: 'tcp://localhost:5004',
			description: 'Remote execution server URL (e.g., tcp://localhost:5004 or tcp://192.168.1.100:5004)',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Password for authenticating with the remote execution server',
			required: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials?.serverUrl || "tcp://localhost:5004"}}',
			url: '/health',
			method: 'GET',
		},
	};
}

