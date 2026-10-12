import type { ComponentProps } from 'react'
import styles from './Button.module.css'

interface ButtonProps extends Omit<ComponentProps<'button'>, 'className'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  // Small is for an action that sits inside a tile.
  size?: 'regular' | 'small'
}

// The host's Button is not shared (each framework builds its own from the
// tokens), so this one is the portal's: primary for the one main action of a
// view, secondary for the rest, ghost for a tertiary action such as editing a row,
// and danger for a destructive one. A button never submits unless it says so.
export function Button({ variant = 'primary', size = 'regular', type = 'button', ...rest }: ButtonProps) {
  const classes = [styles.button, styles[variant], size === 'small' && styles.small].filter(Boolean).join(' ')
  return <button type={type} className={classes} {...rest} />
}
