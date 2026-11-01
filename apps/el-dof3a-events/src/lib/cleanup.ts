import { supabase } from './supabase'

/** deletes the payment photos of the given bookings (the file in `proof_path` + anything else uploaded in that booking's folder) */
export async function purgeProofFiles(items: Array<{ id: string; proof_path: string | null }>) {
  const paths = new Set<string>()
  for (const it of items) if (it.proof_path) paths.add(it.proof_path)
  for (let i = 0; i < items.length; i += 8) {
    await Promise.all(items.slice(i, i + 8).map(async (it) => {
      const { data } = await supabase.storage.from('md-proofs').list(it.id, { limit: 100 })
      data?.forEach((f) => paths.add(`${it.id}/${f.name}`))
    }))
  }
  const all = [...paths]
  for (let i = 0; i < all.length; i += 100) await supabase.storage.from('md-proofs').remove(all.slice(i, i + 100))
}
