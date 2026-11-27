// The phone's storage does not exist while testing; a stand-in that remembers nothing between tests.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
