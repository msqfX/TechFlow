/** 类型化事件总线:场景与 Vue UI 之间的事件通道 */
export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<(payload: unknown) => void>>()

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler as (payload: unknown) => void)
    return () => this.off(event, handler)
  }

  off<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): void {
    this.listeners.get(event)?.delete(handler as (payload: unknown) => void)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const handler of [...set]) {
      ;(handler as (p: Events[K]) => void)(payload)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
