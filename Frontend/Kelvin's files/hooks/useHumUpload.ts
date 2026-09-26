import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadError, uploadHum, type HumUpload } from '../api/uploadHum'

export type UploadStatus = 'idle' | 'sending' | 'sent' | 'failed'

export interface HumUploadRequest {
  status: UploadStatus
  reply: HumUpload | null
  failure: UploadError | null
  /** Sends a recording, cancelling any request still in flight. */
  send: (recording: Blob) => void
  /** Sends the last recording again, so a failed upload needs no re-recording. */
  retry: () => void
  /** Cancels any request and forgets the last result. */
  reset: () => void
}

/** Request state for sending a hum to the backend. */
export function useHumUpload(): HumUploadRequest {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [reply, setReply] = useState<HumUpload | null>(null)
  const [failure, setFailure] = useState<UploadError | null>(null)
  const recordingRef = useRef<Blob | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const send = useCallback(async (recording: Blob) => {
    requestRef.current?.abort()
    const request = new AbortController()
    requestRef.current = request
    recordingRef.current = recording
    setStatus('sending')
    setReply(null)
    setFailure(null)

    try {
      const result = await uploadHum(recording, request.signal)
      if (requestRef.current !== request) return
      setReply(result)
      setStatus('sent')
    } catch (error) {
      if (requestRef.current !== request) return // replaced or reset while in flight
      setFailure(error instanceof UploadError ? error : new UploadError('unexpected', String(error)))
      setStatus('failed')
    }
  }, [])

  const retry = useCallback(() => {
    if (recordingRef.current) void send(recordingRef.current)
  }, [send])

  const reset = useCallback(() => {
    requestRef.current?.abort()
    requestRef.current = null
    recordingRef.current = null
    setStatus('idle')
    setReply(null)
    setFailure(null)
  }, [])

  useEffect(() => () => requestRef.current?.abort(), [])

  return { status, reply, failure, send, retry, reset }
}
