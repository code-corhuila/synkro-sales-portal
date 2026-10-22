import '@testing-library/jest-dom/vitest'

beforeEach(() => {
  // eslint-disable-next-line no-restricted-globals -- Test isolation; never used by production authentication.
  sessionStorage.clear()
})
