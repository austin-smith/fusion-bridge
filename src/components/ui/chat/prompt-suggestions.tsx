import { type LucideIcon } from 'lucide-react'

type Suggestion = string | {
  text: string
  icon?: LucideIcon
}

interface PromptSuggestionsProps {
  label: string
  append: (message: { role: "user"; content: string }) => void
  suggestions: Suggestion[]
}

export function PromptSuggestions({
  label,
  append,
  suggestions,
}: PromptSuggestionsProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-center text-lg font-semibold">{label}</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {suggestions.map((suggestion, index) => {
          const isString = typeof suggestion === 'string'
          const text = isString ? suggestion : suggestion.text
          const Icon = isString ? null : suggestion.icon
          
          return (
            <button
              key={index}
              onClick={() => append({ role: "user", content: text })}
              className="h-max rounded-lg border bg-background p-3 hover:bg-muted text-left flex items-start gap-3"
            >
              {Icon && <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />}
              <p className="line-clamp-2 flex-1">{text}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
