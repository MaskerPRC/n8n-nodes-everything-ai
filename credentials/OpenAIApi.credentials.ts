import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class OpenAIApi implements ICredentialType {
	name = 'openAIApi';

	displayName = 'OpenAI API';

	icon: Icon = { light: 'file:../icons/brain.svg', dark: 'file:../icons/brain.dark.svg' };

	documentationUrl = 'https://platform.openai.com/docs/api-reference';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'API Base URL',
			name: 'apiBaseUrl',
			type: 'string',
			default: 'https://api.openai.com/v1',
			description: 'API Base URL (default: https://api.openai.com/v1)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials?.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials?.apiBaseUrl || "https://api.openai.com/v1"}}',
			url: '/models',
			method: 'GET',
		},
	};
}

