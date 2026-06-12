// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

import { vi } from 'vitest';

vi.mock('axios', () => {
	const mockClient = {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn(),
		interceptors: {
			request: { use: vi.fn() },
			response: { use: vi.fn() }
		}
	};

	return {
		__esModule: true,
		default: {
			create: vi.fn(() => mockClient),
			get: mockClient.get,
			post: mockClient.post,
			put: mockClient.put,
			patch: mockClient.patch,
			delete: mockClient.delete,
			interceptors: mockClient.interceptors
		},
		create: vi.fn(() => mockClient)
	};
});
