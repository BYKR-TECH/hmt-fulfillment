export function ReplacementPartField({ value, onChange }) {
  const control = <select name="replacement_part" value={value} onChange={onChange} required><option value="" disabled>Select part</option><option value="full_kit">Full kit</option><option value="switch">Switch</option><option value="control_module">Control module</option><option value="harness">Harness</option></select>;
  return <label><span>Replacement part</span>{control}</label>;
}
