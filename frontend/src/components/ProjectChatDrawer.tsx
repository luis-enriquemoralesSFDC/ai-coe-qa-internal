import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, Trash2, X, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import {
  projectChatApi,
  type ProjectChatMessageOut,
  type ProjectChatSendResponse,
} from '../api'

/**
 * ProjectChatDrawer
 *
 * Asistente conversacional flotante, contextualizado por proyecto. Se monta
 * tanto en ProjectPage como en StoryPage. Cuando se monta dentro de StoryPage
 * y recibe `activeStoryId`, lo manda al backend para que el LLM tenga acceso
 * al detalle de esa HU.
 *
 * Diseño:
 * - Botón flotante (fixed bottom-right) que abre/cierra el panel.
 * - Panel lateral derecho fijo con header / lista de mensajes / input.
 * - El historial se trae del backend al abrir (no se queda en memoria
 *   solamente). Esto es crítico para Heroku donde un dyno puede reciclarse:
 *   el chat sobrevive porque está en BD.
 *
 * Seguridad / UX:
 * - El input está capped a 2000 chars en el frontend (mismo cap que backend
 *   para evitar enviar requests destinadas a 422).
 * - Mensajes del user se renderizan con whitespace-pre-wrap pero NO con
 *   dangerouslySetInnerHTML — el contenido siempre va como text node, no
 *   como HTML, así no hay XSS aunque el LLM o un user metan markup.
 * - Errores 429 (cuota) y 502 (LLM down) se muestran como toast claros.
 */
type Props = {
  projectId: number
  activeStoryId?: number
}

const MAX_MESSAGE_CHARS = 2000

function MessageBubble({ msg }: { msg: ProjectChatMessageOut }) {
  const { t } = useTranslation()
  const isUser = msg.role === 'user'
  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
      role="listitem"
    >
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-slds px-3 py-2 bg-slds-brand text-white text-sm whitespace-pre-wrap break-words'
            : 'max-w-[85%] rounded-slds px-3 py-2 bg-slds-neutral-2 text-slds-neutral-10 text-sm whitespace-pre-wrap break-words border border-slds-neutral-4'
        }
      >
        {!isUser && (
          <div className="flex items-center gap-1 mb-1 text-xs font-semibold text-slds-ai-dark">
            <Sparkles className="w-3 h-3" />
            <span>{t('project_chat.assistant_label')}</span>
          </div>
        )}
        {msg.content}
      </div>
    </div>
  )
}

export default function ProjectChatDrawer({ projectId, activeStoryId }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const messagesQuery = useQuery({
    queryKey: ['project-chat', projectId],
    queryFn: () => projectChatApi.list(projectId),
    enabled: open,
  })

  const sendMutation = useMutation({
    mutationFn: (msg: string) =>
      projectChatApi.send(projectId, msg, activeStoryId),
    onSuccess: (resp: ProjectChatSendResponse) => {
      queryClient.setQueryData<ProjectChatMessageOut[]>(
        ['project-chat', projectId],
        (prev) => [...(prev ?? []), resp.user_message, resp.assistant_message],
      )
      setInput('')
    },
    onError: (err: any) => {
      const status = err?.response?.status
      if (status === 429) {
        toast.error(t('project_chat.toast_quota'))
      } else {
        toast.error(err?.response?.data?.detail ?? t('project_chat.toast_error'))
      }
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => projectChatApi.clear(projectId),
    onSuccess: () => {
      queryClient.setQueryData<ProjectChatMessageOut[]>(
        ['project-chat', projectId],
        [],
      )
      toast.success(t('project_chat.toast_clear_done'))
    },
    onError: () => toast.error(t('project_chat.toast_clear_error')),
  })

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (open && messagesQuery.data) {
      scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messagesQuery.data, sendMutation.isPending])

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return
    if (text.length > MAX_MESSAGE_CHARS) {
      toast.error(`El mensaje supera ${MAX_MESSAGE_CHARS} caracteres`)
      return
    }
    if (sendMutation.isPending) return
    sendMutation.mutate(text)
  }

  function handleClear() {
    if (!window.confirm(t('project_chat.empty_state'))) {
      return
    }
    clearMutation.mutate()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const messages = messagesQuery.data ?? []
  const isEmpty = messages.length === 0
  const charsLeft = MAX_MESSAGE_CHARS - input.length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-slds-ai text-white shadow-slds-drop flex items-center justify-center hover:bg-slds-ai-dark transition-colors"
        aria-label={open ? t('project_chat.close_title') : t('project_chat.open_title')}
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>

      {open && (
        <div
          className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white border-l border-slds-neutral-4 shadow-slds-drop z-30 flex flex-col"
          role="complementary"
          aria-label="Asistente del proyecto"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slds-neutral-4 bg-slds-neutral-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-slds-ai text-white flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-sm text-slds-neutral-10">
                  {t('project_chat.assistant_label')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClear}
                className="slds-btn-icon"
                title={t('project_chat.clear_title')}
                aria-label={t('project_chat.clear_title')}
                disabled={isEmpty || clearMutation.isPending}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="slds-btn-icon"
                title={t('project_chat.close_title')}
                aria-label={t('project_chat.close_title')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto px-4 py-3 bg-white"
            role="list"
            aria-live="polite"
          >
            {messagesQuery.isLoading && (
              <div className="text-center text-xs text-slds-neutral-7 py-6">
                {t('common.loading')}
              </div>
            )}
            {!messagesQuery.isLoading && isEmpty && (
              <div className="text-center text-sm text-slds-neutral-7 py-8">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-slds-ai" />
                <div className="font-medium text-slds-neutral-9">
                  {t('project_chat.empty_state')}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} />
            ))}
            {sendMutation.isPending && (
              <div className="flex justify-start mb-3">
                <div className="rounded-slds px-3 py-2 bg-slds-neutral-2 text-slds-neutral-7 text-xs flex items-center gap-2 border border-slds-neutral-4">
                  <span className="slds-spinner" />
                  Pensando…
                </div>
              </div>
            )}
            <div ref={scrollAnchorRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-slds-neutral-4 p-3 bg-white flex-shrink-0"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={MAX_MESSAGE_CHARS}
              placeholder={t('project_chat.input_placeholder')}
              className="slds-textarea text-sm"
              disabled={sendMutation.isPending}
            />
            <div className="flex items-center justify-between mt-2">
              <div
                className={`text-xs ${
                  charsLeft < 100
                    ? 'text-slds-error'
                    : 'text-slds-neutral-6'
                }`}
              >
                {charsLeft}
              </div>
              <button
                type="submit"
                className="slds-btn-ai"
                title={t('project_chat.send_title')}
                disabled={!input.trim() || sendMutation.isPending}
              >
                {sendMutation.isPending ? (
                  <span className="slds-spinner" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
