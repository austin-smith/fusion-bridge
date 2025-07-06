interface PromptSuggestionsProps {
  label: string
  append: (message: { role: "user"; content: string }) => void
  suggestions: string[]
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
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => append({ role: "user", content: suggestion })}
            className="h-max rounded-lg border bg-background p-3 hover:bg-muted text-left"
          >
            <p className="line-clamp-2">{suggestion}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
