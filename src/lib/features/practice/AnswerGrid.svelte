<script lang="ts">
  import type { Bird, Mode } from '$lib/data';
  import { assetUrl, photoFor, photoReady } from '$lib/media';
  import BirdImage from '$lib/ui/BirdImage.svelte';

  type Props = {
    options: Bird[];
    mode: Mode;
    optionImageIds: Record<string, string>;
    selectedId?: string;
    disabled?: boolean;
    onChoose: (optionId: string) => void;
  };

  let { options, mode, optionImageIds, selectedId, disabled = false, onChoose }: Props = $props();
  let nameOptions = $derived(mode.endsWith('name'));
</script>

<div class:name-options={nameOptions} class="options">
  {#each options as option, index (option.id)}
    <button
      {disabled}
      class="option"
      class:selected={selectedId === option.id}
      aria-label={`Answer ${index + 1}`}
      onclick={() => onChoose(option.id)}
    >
      {#if nameOptions}
        <span class="option-name">{option.name}</span>
      {:else if photoReady(option, optionImageIds[option.id])}
        <BirdImage
          variant="option"
          src={assetUrl(photoFor(option, optionImageIds[option.id])?.url ?? '')}
          alt=""
          placeholderClassName="photo-card-placeholder"
        />
      {:else}
        <span class="photo-card-placeholder">Photo pending</span>
      {/if}
      <span class="option-number">{index + 1}</span>
    </button>
  {/each}
</div>
