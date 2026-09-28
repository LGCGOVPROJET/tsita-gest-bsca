export function tabPanelProps(prefix: string, key: string) {
  return {
    role: 'tabpanel' as const,
    id: `${prefix}-panel-${key}`,
    'aria-labelledby': `${prefix}-tab-${key}`,
    tabIndex: 0,
    className: 'tabpanel',
  };
}
