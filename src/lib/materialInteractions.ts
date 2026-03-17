export function canAttemptDelete(params: { hasUser: boolean; deleting: boolean; confirmed: boolean }): boolean {
  return params.hasUser && !params.deleting && params.confirmed
}

export function shouldShowUploadError(uploadError: string | null): uploadError is string {
  return Boolean(uploadError)
}
