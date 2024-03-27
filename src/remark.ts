import { remark as createRemark } from 'remark'
import gfm from 'remark-gfm'

export const remark = createRemark().use(gfm).data('settings', {
  bullet: '-',
})
