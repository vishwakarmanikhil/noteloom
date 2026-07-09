/**
 * One shared icon family for every interactive control across the editor —
 * outline style (24x24 viewBox, 2px stroke, no fill, round caps/joins,
 * matching the common Feather/Lucide convention) so every icon inherits its
 * color from surrounding text via stroke="currentColor" and scales via the
 * `size` prop, instead of the previously ad-hoc mix of unicode characters
 * (▸ ▾ × 📎 +) and single-letter text labels (B/I/U/S) each block used to
 * render on its own.
 */
function Icon({ children, size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function ChevronRightIcon(props) {
  return (
    <Icon {...props}>
      <polyline points="9 18 15 12 9 6" />
    </Icon>
  );
}

export function ChevronDownIcon(props) {
  return (
    <Icon {...props}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  );
}

export function XIcon(props) {
  return (
    <Icon {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  );
}

export function PaperclipIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Icon>
  );
}

export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  );
}

export function BoldIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </Icon>
  );
}

export function ItalicIcon(props) {
  return (
    <Icon {...props}>
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </Icon>
  );
}

export function UnderlineIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 3v7a6 6 0 0 0 12 0V3" />
      <line x1="4" y1="21" x2="20" y2="21" />
    </Icon>
  );
}

export function StrikethroughIcon(props) {
  return (
    <Icon {...props}>
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </Icon>
  );
}

export function AlignLeftIcon(props) {
  return (
    <Icon {...props}>
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="17" y1="10" x2="3" y2="10" />
      <line x1="21" y1="14" x2="3" y2="14" />
      <line x1="17" y1="18" x2="3" y2="18" />
    </Icon>
  );
}

export function AlignCenterIcon(props) {
  return (
    <Icon {...props}>
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="18" y1="10" x2="6" y2="10" />
      <line x1="21" y1="14" x2="3" y2="14" />
      <line x1="18" y1="18" x2="6" y2="18" />
    </Icon>
  );
}

export function AlignRightIcon(props) {
  return (
    <Icon {...props}>
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="21" y1="10" x2="7" y2="10" />
      <line x1="21" y1="14" x2="3" y2="14" />
      <line x1="21" y1="18" x2="7" y2="18" />
    </Icon>
  );
}
