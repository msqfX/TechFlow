import type { Category } from '@/types/content'
import computer from './categories/computer.json'
import network from './categories/network.json'
import infrastructure from './categories/infrastructure.json'
import runtime from './categories/runtime.json'
import middleware from './categories/middleware.json'
import cloudNative from './categories/cloud-native.json'
import database from './categories/database.json'
import algorithm from './categories/algorithm.json'

/** 全部技术分类(内容驱动,页面组件不得写死) */
export const categories: Category[] = [
  computer,
  network,
  infrastructure,
  runtime,
  middleware,
  cloudNative,
  database,
  algorithm,
].sort((a, b) => a.order - b.order)

export function getCategory(id: string): Category | undefined {
  return categories.find(c => c.id === id)
}
