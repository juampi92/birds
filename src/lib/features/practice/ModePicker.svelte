<script lang="ts">
  import type { Mode } from '$lib/data';

  type Props = {
    selectedModes: Mode[];
    onChange: (modes: Mode[]) => void;
    disabled?: boolean;
    className?: string;
  };

  let { selectedModes, onChange, disabled = false, className = '' }: Props = $props();

  const modeOptions: Array<{
    mode: Mode;
    input: 'sound' | 'photo';
    output: 'photo' | 'name';
  }> = [
    { mode: 'sound-photo', input: 'sound', output: 'photo' },
    { mode: 'photo-name', input: 'photo', output: 'name' }
  ];

  function toggle(mode: Mode, checked: boolean) {
    const next = checked
      ? [...selectedModes, mode]
      : selectedModes.filter((selected) => selected !== mode);
    onChange([...new Set(next)]);
  }
</script>

<fieldset class={`mode-picker ${className}`} {disabled}>
  <legend class="sr-only">Choose question types</legend>
  {#each modeOptions as option (option.mode)}
    <label class:selected={selectedModes.includes(option.mode)} class="mode-option">
      <input
        type="checkbox"
        checked={selectedModes.includes(option.mode)}
        {disabled}
        aria-label={`${option.input} to ${option.output}`}
        onchange={(event) => toggle(option.mode, event.currentTarget.checked)}
      />
      <span class="mode-check" aria-hidden="true">
        {selectedModes.includes(option.mode) ? '✓' : ''}
      </span>
      <span class="mode-flow" aria-hidden="true">
        {#if option.input === 'sound'}
          <svg class="mode-icon" viewBox="0 0 24 24" fill="none">
            <path d="M11 5 6 9H2v6h4l5 4V5Z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        {:else}
          <svg class="mode-icon" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9" r="1.5" />
            <path d="m3 16 5-5 4 4 3-3 6 6" />
          </svg>
        {/if}
        <span>{option.input === 'sound' ? 'Sound' : 'Photo'}</span>
        <span class="mode-arrow" aria-hidden="true">→</span>
        <span>{option.output}</span>
      </span>
    </label>
  {/each}
</fieldset>
