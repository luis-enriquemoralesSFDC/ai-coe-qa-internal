import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, CheckSquare, FileText, Trash2, X, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectsApi } from '../api'
import { useAuth } from '../hooks/useAuth'

interface Project {
  id: number
  name: string
  description?: string
  stories_count: number
  test_cases_count: number
  created_at: string
}

export default function DashboardPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Proyecto creado')
      setShowForm(false)
      setName('')
      setDescription('')
    },
    onError: () => toast.error('Error al crear el proyecto'),
  })

  const deleteMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Proyecto eliminado')
    },
  })

  return (
    <div>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slds-neutral-10 tracking-tight">
            Hola, {user?.name}
          </h1>
          <p className="text-slds-neutral-7 mt-2">
            Tus proyectos
            {!isLoading && projects.length > 0 && (
              <span className="ml-1 text-slds-neutral-6">({projects.length})</span>
            )}
            {' '}— solo tú puedes ver esta información.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="slds-btn-brand flex-shrink-0">
          <Plus className="w-4 h-4" />
          Nuevo proyecto
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-slds-neutral-3 rounded-slds p-5 animate-pulse"
            >
              <div className="h-5 bg-slds-neutral-3 rounded w-3/4 mb-3" />
              <div className="h-3 bg-slds-neutral-2 rounded w-full mb-2" />
              <div className="h-3 bg-slds-neutral-2 rounded w-2/3 mb-6" />
              <div className="flex gap-4">
                <div className="h-3 bg-slds-neutral-2 rounded w-20" />
                <div className="h-3 bg-slds-neutral-2 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-slds-neutral-3 rounded-slds py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-slds-brand-light flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-slds-brand" />
          </div>
          <p className="text-slds-neutral-10 font-semibold text-lg">La IA está lista.</p>
          <p className="text-slds-neutral-7 text-sm mt-2 max-w-md mx-auto">
            Crea tu primer proyecto para empezar a generar casos de prueba automáticamente a partir de tus historias de usuario.
          </p>
          <button onClick={() => setShowForm(true)} className="slds-btn-brand mt-6">
            <Plus className="w-4 h-4" /> Crear primer proyecto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={() => {
                if (confirm('¿Eliminar este proyecto y todos sus datos?')) {
                  deleteMutation.mutate(project.id)
                }
              }}
            />
          ))}
          <NewProjectCard onClick={() => setShowForm(true)} />
        </div>
      )}

      {/* ── New project modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="slds-modal-backdrop">
          <div className="slds-modal">
            <div className="slds-modal__header">
              <h3 className="font-semibold text-slds-neutral-10">Nuevo proyecto</h3>
              <button onClick={() => setShowForm(false)} className="slds-btn-icon">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ name, description }) }}
              className="slds-modal__body space-y-4"
            >
              <div>
                <label className="slds-label">Nombre del proyecto *</label>
                <input
                  className="slds-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ej: App Mobile v2.0"
                />
              </div>
              <div>
                <label className="slds-label">Descripción</label>
                <textarea
                  className="slds-textarea"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Breve descripción del proyecto..."
                />
              </div>
            </form>
            <div className="slds-modal__footer">
              <button type="button" onClick={() => setShowForm(false)} className="slds-btn-neutral">
                Cancelar
              </button>
              <button
                type="button"
                className="slds-btn-brand"
                disabled={createMutation.isPending || !name.trim()}
                onClick={() => createMutation.mutate({ name, description })}
              >
                {createMutation.isPending
                  ? <><span className="slds-spinner mr-1" /> Creando...</>
                  : 'Crear proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  return (
    <div
      className="group relative bg-white border border-slds-neutral-3 rounded-slds p-5
                 hover:border-slds-brand hover:shadow-slds-card transition-all min-h-[170px]"
    >
      {/* Stretched link — todo el card es clickeable */}
      <Link
        to={`/projects/${project.id}`}
        aria-label={`Abrir proyecto ${project.name}`}
        className="absolute inset-0 z-0 rounded-slds focus-visible:ring-2 focus-visible:ring-slds-brand focus-visible:outline-none"
      />

      {/* Delete (queda por encima del link) */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 absolute top-3 right-3 z-10
                   w-7 h-7 rounded-full inline-flex items-center justify-center
                   text-slds-neutral-6 hover:text-slds-error hover:bg-slds-error-bg transition-all"
        aria-label="Eliminar proyecto"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/*
        Contenido — pointer-events-none al wrapper para que el padding del card
        lleve los clicks al Link stretched.
        Excepción: <p> de descripción y <div> de footer reactivan pointer-events
        para que el texto se pueda seleccionar/copiar (trade-off del stretched link).
      */}
      <div className="relative pointer-events-none">
        <h3 className="font-semibold text-slds-neutral-10 line-clamp-1 text-base">
          {project.name}
        </h3>
        <p className="text-sm text-slds-neutral-7 line-clamp-2 mt-2 min-h-[40px]
                      pointer-events-auto select-text cursor-text">
          {project.description || 'Sin descripción'}
        </p>
        <div className="flex items-center gap-2 mt-4 text-xs text-slds-neutral-7
                        pointer-events-auto select-text cursor-text">
          <span className="inline-flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-slds-brand" />
            {project.stories_count} historias
          </span>
          <span className="text-slds-neutral-4">·</span>
          <span className="inline-flex items-center gap-1">
            <CheckSquare className="w-3.5 h-3.5 text-slds-success" />
            {project.test_cases_count} casos
          </span>
        </div>
      </div>
    </div>
  )
}

function NewProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group border-2 border-dashed border-slds-neutral-4 rounded-slds p-5
                 flex flex-col items-center justify-center gap-3 min-h-[170px]
                 text-slds-neutral-7 hover:border-slds-brand hover:bg-slds-brand-light hover:text-slds-brand
                 focus-visible:border-slds-brand focus-visible:bg-slds-brand-light focus-visible:text-slds-brand
                 focus-visible:outline-none transition-all"
    >
      <div className="w-10 h-10 rounded-full bg-slds-neutral-2 group-hover:bg-white flex items-center justify-center transition-colors">
        <Plus className="w-5 h-5" />
      </div>
      <span className="text-sm font-medium">Nuevo proyecto</span>
    </button>
  )
}
