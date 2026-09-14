<script lang="ts">
  type Variant = 'question' | 'option' | 'reveal' | 'thumb' | 'default';
  type Props = {
    src: string;
    alt: string;
    fallback?: string;
    variant?: Variant;
    className?: string;
    placeholderClassName?: string;
  };

  let {
    src,
    alt,
    fallback = 'Photo pending',
    variant = 'default',
    className = '',
    placeholderClassName = ''
  }: Props = $props();
  let failed = $state(false);

  $effect(() => {
    const currentSrc = src;
    failed = !currentSrc;
  });
</script>

{#if src && !failed}
  <img
    class={`bird-image bird-image-${variant} ${className}`}
    {src}
    {alt}
    onerror={() => (failed = true)}
  />
{:else}
  <div class={`bird-image-placeholder bird-image-placeholder-${variant} ${placeholderClassName}`}>
    <span>{fallback}</span>
  </div>
{/if}
