"use client";

import dynamic from "next/dynamic";
import { useState, type ComponentType } from "react";

type PreloadablePanel<P> = ComponentType<P> & { preload: () => Promise<unknown> };

/**
 * Client-only code-split panel that can be loaded ahead of its first open.
 *
 * A lazy component suspends on its first render even when its chunk is already
 * downloaded, and React then holds the empty fallback for ~300ms, which collapses
 * content-sized sheets. Once preloaded, new mounts render the loaded component
 * directly. Each mount keeps the variant it started with, so a panel opened before
 * the preload finished is never remounted (losing its state) when it completes.
 */
export function preloadablePanel<P extends object>(load: () => Promise<ComponentType<P>>): PreloadablePanel<P> {
  let loaded: ComponentType<P> | null = null;
  const preload = () => load().then((component) => {
    loaded = component;
    return component;
  });
  const LazyPanel = dynamic(preload, { ssr: false });

  function Panel(props: P) {
    const [Loaded] = useState(() => loaded);
    return Loaded ? <Loaded {...props} /> : <LazyPanel {...props} />;
  }

  return Object.assign(Panel, { preload });
}
