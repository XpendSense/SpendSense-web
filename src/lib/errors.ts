import { ConnectError, Code } from '@connectrpc/connect'

/** True when the error means the session is invalid and the user should be logged out. */
export function isSessionError(err: unknown): boolean {
  if (!(err instanceof ConnectError)) return false
  if (err.code === Code.Unauthenticated) return true
  if (err.code === Code.NotFound && err.rawMessage?.toLowerCase().includes('user')) return true
  return false
}

export function formatError(err: unknown): string {
  if (err instanceof ConnectError) {
    switch (err.code) {
      case Code.Unknown:
        return 'Unable to reach the server. Check that the backend is running.'
      case Code.Unauthenticated:
        return 'Session expired. Please log in again.'
      case Code.PermissionDenied:
        return 'You don\'t have permission to do this.'
      case Code.NotFound:
        return err.rawMessage || 'The requested resource was not found.'
      case Code.AlreadyExists:
        return err.rawMessage || 'This already exists.'
      case Code.InvalidArgument:
        return err.rawMessage || 'Invalid input. Please check your entries.'
      case Code.Internal:
        return 'Something went wrong on our end. Please try again.'
      case Code.Unavailable:
        return 'Service is temporarily unavailable. Please try again shortly.'
      default:
        return err.rawMessage || 'An unexpected error occurred.'
    }
  }
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred.'
}
