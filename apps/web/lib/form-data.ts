export function getFormText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export function getOptionalFormText(form: FormData, key: string): string | undefined {
  return getFormText(form, key) || undefined;
}

export function getFormList(form: FormData, key: string): string[] {
  return getFormText(form, key)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
