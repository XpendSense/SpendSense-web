import { logger } from '../index'

beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('logger', () => {
  describe('logger.info', () => {
    it('calls console.info with the action and data', () => {
      logger.info('budget.create', { budgetId: '123' })
      expect(console.info).toHaveBeenCalledWith('[WellSpent] budget.create', { budgetId: '123' })
    })

    it('passes empty string when no data is provided', () => {
      logger.info('page.view')
      expect(console.info).toHaveBeenCalledWith('[WellSpent] page.view', '')
    })
  })

  describe('logger.warn', () => {
    it('calls console.warn with the action and data', () => {
      logger.warn('feature.disabled', { flag: 'googleAuth' })
      expect(console.warn).toHaveBeenCalledWith('[WellSpent] feature.disabled', { flag: 'googleAuth' })
    })
  })

  describe('logger.error', () => {
    it('calls console.error with the action and data', () => {
      logger.error('auth.login.failed', { email: 'a@b.com', error: 'Invalid credentials' })
      expect(console.error).toHaveBeenCalledWith('[WellSpent] auth.login.failed', { email: 'a@b.com', error: 'Invalid credentials' })
    })

    it('passes empty string when no data is provided', () => {
      logger.error('unexpected')
      expect(console.error).toHaveBeenCalledWith('[WellSpent] unexpected', '')
    })
  })
})
