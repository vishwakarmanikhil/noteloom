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

export function MoreHorizontalIcon(props) {
  return (
    <Icon {...props} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
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

export function PencilIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </Icon>
  );
}

/** A freehand squiggle — the "Canvas" slash-command icon, distinct from PencilIcon (used elsewhere for text/link editing) since this represents drawing, not editing text. */
export function ScribbleIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />
    </Icon>
  );
}

export function LinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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

// A 2x3 grid of solid dots (drag-handle convention) — unlike every other
// icon here, these are filled, not stroked outlines: a 1px-radius circle
// with only a stroke renders as a barely-visible ring at this size, so each
// dot overrides the shared Icon wrapper's fill="none"/stroke defaults
// directly rather than inheriting them.
export function GripVerticalIcon(props) {
  return (
    <Icon {...props}>
      {[5, 12, 19].flatMap((cy) =>
        [9, 15].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" fill="currentColor" stroke="none" />),
      )}
    </Icon>
  );
}

export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </Icon>
  );
}

export function CopyIcon(props) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}

export function ArrowUpIcon(props) {
  return (
    <Icon {...props}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </Icon>
  );
}

export function ArrowDownIcon(props) {
  return (
    <Icon {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </Icon>
  );
}

export function SquareIcon(props) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
    </Icon>
  );
}

export function CircleIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
    </Icon>
  );
}

export function ArrowDiagonalIcon(props) {
  return (
    <Icon {...props}>
      <line x1="6" y1="18" x2="18" y2="6" />
      <polyline points="9 6 18 6 18 15" />
    </Icon>
  );
}

export function DiamondIcon(props) {
  return (
    <Icon {...props}>
      <polygon points="12 3 21 12 12 21 3 12" />
    </Icon>
  );
}

export function TriangleIcon(props) {
  return (
    <Icon {...props}>
      <polygon points="12 4 20 20 4 20" />
    </Icon>
  );
}

export function StarIcon(props) {
  return (
    <Icon {...props}>
      <polygon points="12 3 14.7 9.4 21.5 9.9 16.3 14.4 17.9 21 12 17.4 6.1 21 7.7 14.4 2.5 9.9 9.3 9.4" />
    </Icon>
  );
}

export function CursorIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 3l14 8-6 2-2 6-6-16z" />
    </Icon>
  );
}

export function EraserIcon(props) {
  return (
    <Icon {...props}>
      <path d="M19 20H9l-6-6a1.5 1.5 0 0 1 0-2l9-9a1.5 1.5 0 0 1 2 0l7 7a1.5 1.5 0 0 1 0 2l-7 7" />
      <path d="M6.5 12.5 13 19" />
    </Icon>
  );
}

export function DownloadIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </Icon>
  );
}

export function MagnetIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 15V9a6 6 0 0 1 12 0v6" />
      <path d="M6 15a3 3 0 0 0 6 0v-4" />
      <path d="M18 15a3 3 0 0 1-6 0v-4" />
      <line x1="3" y1="9" x2="6" y2="9" />
      <line x1="3" y1="15" x2="6" y2="15" />
      <line x1="18" y1="9" x2="21" y2="9" />
      <line x1="18" y1="15" x2="21" y2="15" />
    </Icon>
  );
}

export function ScissorsIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </Icon>
  );
}

// --- Slash-menu command icons ---------------------------------------------
// One icon per command so the "/" menu reads like Notion/TipTap's own
// (glyph + label, not label-only) — see SlashMenu.jsx and each block/
// inline type's own `slashCommand(s)` definition for where these attach.

export function TextIcon(props) {
  return (
    <Icon {...props}>
      <line x1="17" y1="6" x2="3" y2="6" />
      <line x1="21" y1="12" x2="3" y2="12" />
      <line x1="15" y1="18" x2="3" y2="18" />
    </Icon>
  );
}

/** Parameterized by `level` (1-3) — a single "H" + digit, filled text rather than the shared stroke-only glyphs above. */
export function HeadingIcon({ level = 1, size = 16, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
      <text x="2" y="18" fontSize="14" fontWeight="700" fill="currentColor" fontFamily="inherit">
        H{level}
      </text>
    </svg>
  );
}

// Fixed-level wrappers around HeadingIcon — plain-.js command definitions
// (e.g. blocks/heading/index.js) can't write JSX to pass `level` themselves,
// so each level gets its own importable component instead.
export function Heading1Icon(props) {
  return <HeadingIcon level={1} {...props} />;
}
export function Heading2Icon(props) {
  return <HeadingIcon level={2} {...props} />;
}
export function Heading3Icon(props) {
  return <HeadingIcon level={3} {...props} />;
}

export function QuoteIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 7a3 3 0 0 0-3 3v3a2 2 0 0 0 2 2h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H6a3 3 0 0 1 3-3z" />
      <path d="M17 7a3 3 0 0 0-3 3v3a2 2 0 0 0 2 2h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-2a3 3 0 0 1 3-3z" />
    </Icon>
  );
}

export function CodeIcon(props) {
  return (
    <Icon {...props}>
      <polyline points="9 8 4 12 9 16" />
      <polyline points="15 8 20 12 15 16" />
    </Icon>
  );
}

export function DividerIcon(props) {
  return (
    <Icon {...props}>
      <line x1="4" y1="12" x2="20" y2="12" />
    </Icon>
  );
}

export function CalloutIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="12.5" x2="13" y2="12.5" />
    </Icon>
  );
}

export function ButtonIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="8" width="18" height="8" rx="3" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </Icon>
  );
}

export function TableIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="3" y1="16" x2="21" y2="16" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </Icon>
  );
}

export function ColumnsIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </Icon>
  );
}

export function BulletedListIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
      <line x1="9" y1="6" x2="21" y2="6" />
      <line x1="9" y1="12" x2="21" y2="12" />
      <line x1="9" y1="18" x2="21" y2="18" />
    </Icon>
  );
}

export function NumberedListIcon(props) {
  return (
    <Icon {...props}>
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <text x="2" y="8.5" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
        1
      </text>
      <text x="2" y="14.5" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
        2
      </text>
      <text x="2" y="20.5" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
        3
      </text>
    </Icon>
  );
}

export function CheckboxIcon(props) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <polyline points="8 12 11 15 16 9" />
    </Icon>
  );
}

export function MentionIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4.5 7.79" />
    </Icon>
  );
}

export function DateIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </Icon>
  );
}

export function SelectIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-.59 1.41l-8 8a2 2 0 0 1-2.82 0l-7-7a2 2 0 0 1 0-2.82l8-8A2 2 0 0 1 12 3z" />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ImageIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M4 17l5-5 4 4 4-5 4 6" />
    </Icon>
  );
}

export function VideoIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M17 10l4-2.5v9L17 14" />
    </Icon>
  );
}

export function EyeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon(props) {
  return (
    <Icon {...props}>
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </Icon>
  );
}

export function AudioIcon(props) {
  return (
    <Icon {...props}>
      <line x1="4" y1="10" x2="4" y2="14" />
      <line x1="8" y1="7" x2="8" y2="17" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="16" y1="7" x2="16" y2="17" />
      <line x1="20" y1="10" x2="20" y2="14" />
    </Icon>
  );
}

export function MicIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </Icon>
  );
}
