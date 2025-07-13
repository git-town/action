import type { Context } from '../types'
import { CommentLocationAdapter } from './comment'
import { DescriptionLocationAdapter } from './description'
import type { AbstractLocationAdapter } from './types'

export function createLocationAdapter(context: Context): AbstractLocationAdapter {
  switch (context.location) {
    case 'description':
      return new DescriptionLocationAdapter(context)
    case 'comment':
      return new CommentLocationAdapter(context)
  }
}
