export function Button({
  as: Component = 'button',
  variant = 'primary',
  className = '',
  children,
  ...props
}) {
  const variants = {
    primary: 'ui-button-primary',
    ghost: 'ui-button-ghost',
    link: 'ui-button-link',
    icon: 'ui-button-icon',
  }
  const base = variant === 'icon' ? 'ui-button-icon' : 'ui-button'

  return (
    <Component className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </Component>
  )
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      {label ? <span>{label}</span> : null}
      {children}
    </label>
  )
}

export function SectionHeader({ children, className = '' }) {
  return <h2 className={`ui-section-title ${className}`}>{children}</h2>
}

export function SegmentedToggle({ items, value, onChange, className = '' }) {
  return (
    <div className={`ui-toggle ${className}`}>
      {items.map((item) => {
        const itemValue = item.value ?? item
        const label = item.label ?? item
        const active = itemValue === value

        return (
          <button
            key={itemValue}
            type="button"
            aria-pressed={active}
            className="ui-toggle-button"
            onClick={() => onChange(itemValue)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function Badge({ children, variant = 'calc', className = '' }) {
  const variants = {
    calc: 'ui-badge-calc',
    ai: 'ui-badge-ai',
  }

  return (
    <span className={`ui-badge ${variants[variant] || variants.calc} ${className}`}>
      {children}
    </span>
  )
}

export function Tag({ children, variant = 'default', className = '' }) {
  return (
    <span className={`ui-tag ${variant === 'alt' ? 'ui-tag-alt' : ''} ${className}`}>
      {children}
    </span>
  )
}

export function Spinner({ className = '' }) {
  return <span className={`ui-spinner ${className}`} aria-hidden="true" />
}
