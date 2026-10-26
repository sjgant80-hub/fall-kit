// core/phase4/data.mjs — the five datasets, read from the pinned data files through dex-frontier's own loaders (vendored
// under ./dex, byte for byte). Glue, shared by the measurement and the life it runs; the page loads the same loaders.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBank, loadAdult } from './dex/src/fresh.mjs';
import { loadCredit } from './dex/src/fresh2.mjs';
import { loadCoupon } from './dex/src/fresh3.mjs';
import { loadShop } from './dex/src/silos.mjs';

/** dir holds data/… as fetched at the pinned commit (vendor-dex.mjs fetchData) */
export function loadAll(dir) {
  const t = (p) => readFileSync(join(dir, p), 'utf8');
  const ds = {
    shop: loadShop(t('data/online_shoppers_intention.csv')), bank: loadBank(t('data/bank-additional-full.csv')),
    adult: loadAdult(t('data/adult.data'), t('data/adult.test')), credit: loadCredit(t('data/credit-default.csv')), coupon: loadCoupon(t('data/in-vehicle-coupon-recommendation.csv')),
  };
  for (const [k, d] of Object.entries(ds)) if (!d.ok) throw new Error(k + ': ' + d.error);
  return ds;
}
