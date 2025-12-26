import { orderBy, query } from 'firebase/firestore'
import useCollectionSubscription from './useCollectionSubscription'

export function useEvStatusSegments(clientId) {
  const path = clientId ? `clients/${clientId}/evStatusSegments` : 'clients/_noop/evStatusSegments'
  const { data, loading, error } = useCollectionSubscription(path, (ref) =>
    clientId ? query(ref, orderBy('validFrom', 'desc')) : ref
  )
  return { segments: clientId ? data : [], loading: clientId ? loading : false, error: clientId ? error : '' }
}

export function useEvActivityPeriods(clientId) {
  const path = clientId ? `clients/${clientId}/evActivityPeriods` : 'clients/_noop/evActivityPeriods'
  const { data, loading, error } = useCollectionSubscription(path, (ref) =>
    clientId ? query(ref, orderBy('from', 'desc')) : ref
  )
  return { periods: clientId ? data : [], loading: clientId ? loading : false, error: clientId ? error : '' }
}
