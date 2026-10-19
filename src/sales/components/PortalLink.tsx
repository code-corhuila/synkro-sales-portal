import type { ComponentProps, MouseEvent } from 'react'
import { navigateTo } from '../../navigation'
import styles from './PortalLink.module.css'

type PortalLinkProps = Omit<ComponentProps<'a'>, 'href'> & { href: string }

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
}

// A real link to another screen of the portal. A plain left click navigates without a
// document load; a modified or middle click is the browser's (a new tab), and the href makes it work.
export function PortalLink({ href, onClick, className, ...rest }: PortalLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || !isPlainLeftClick(event)) return
    event.preventDefault()
    navigateTo(href)
  }
  const classes = [styles.link, className].filter(Boolean).join(' ')
  return <a href={href} className={classes} onClick={handleClick} {...rest} />
}
