/* eslint-disable prefer-const */
import { Pair, Token, Bundle } from '../types/schema'
import { BigDecimal, Address, BigInt } from '@graphprotocol/graph-ts/index'
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD } from './helpers'

const WBNB_ADDRESS = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'
const USDC_WBNB_PAIR = '0x7b5802df69165f02b9149abb735d6e0d23f30a40' // created block 10504564
const BUSD_WBNB_PAIR = '0x239ed5acb86e93d98829ab7fa413e40bb7ebf1e2' // created block 9691302
const USDT_WBNB_PAIR = '0x6bb2b0389e68b94305a7Fb25675C55DBcc107ea5' // created block 9870919

export function getBnbPriceInUSD(): BigDecimal {
  // fetch bnb prices for each stablecoin
  let busdPair = Pair.load(BUSD_WBNB_PAIR) // busd is token1
  let usdcPair = Pair.load(USDC_WBNB_PAIR) // usdc is token0
  let usdtPair = Pair.load(USDT_WBNB_PAIR) // usdt is token0

  // all 3 have been created
  if (busdPair !== null && usdcPair !== null && usdtPair !== null) {
    let totalLiquidityBNB = busdPair.reserve0.plus(usdcPair.reserve1).plus(usdtPair.reserve1)
    let busdWeight = busdPair.reserve0.div(totalLiquidityBNB)
    let usdcWeight = usdcPair.reserve1.div(totalLiquidityBNB)
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityBNB)
    return busdPair.token1Price
      .times(busdWeight)
      .plus(usdcPair.token0Price.times(usdcWeight))
      .plus(usdtPair.token0Price.times(usdtWeight))
    // BUSD and USDT have been created
  } else if (busdPair !== null && usdtPair !== null) {
    let totalLiquidityBNB = busdPair.reserve0.plus(usdtPair.reserve1)
    let busdWeight = busdPair.reserve0.div(totalLiquidityBNB)
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityBNB)
    return busdPair.token1Price.times(busdWeight).plus(usdtPair.token0Price.times(usdtWeight))
    // BUSD is the only pair so far
  } else if (busdPair !== null) {
    return busdPair.token1Price
  } else {
    return ZERO_BD
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
  '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
  '0x55d398326f99059ff775485246999027b3197955', // USDT
  '0xb32ac3c79a94ac1eb258f3c830bbdbc676483c93', // OSWAP
  '0xaec945e04baf28b135fa7c640f624f8d90f1c3a6', // C98
  '0xb0e1fc65c1a741b4662b813eb787d369b8614af1', // IF
  '0x31720b2276df3b3b757b55845d17eea184d4fc8f', // OAX
  '0x0b15ddf19d47e6a86a56148fb4afffc6929bcb89', // IDIA
]

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
let MINIMUM_USD_THRESHOLD_NEW_PAIRS = BigDecimal.fromString('0')

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_BNB = BigDecimal.fromString('0')

/**
 * Search through graph to find derived Bnb per token.
 * @todo update to be derived BNB (add stablecoin estimates)
 **/
export function findBnbPerToken(token: Token): BigDecimal {
  if (token.id == WBNB_ADDRESS) {
    return ONE_BD
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]))
    if (pairAddress.toHexString() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHexString())
      if (pair.token0 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token1 = Token.load(pair.token1)
        return pair.token1Price.times(token1.derivedBNB as BigDecimal) // return token1 per our token * Bnb per token 1
      }
      if (pair.token1 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token0 = Token.load(pair.token0)
        return pair.token0Price.times(token0.derivedBNB as BigDecimal) // return token0 per our token * BNB per token 0
      }
    }
  }
  return ZERO_BD // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  pair: Pair
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedBNB.times(bundle.bnbPrice)
  let price1 = token1.derivedBNB.times(bundle.bnbPrice)

  // if less than 5 LPs, require high minimum reserve amount amount or return 0
  if (pair.liquidityProviderCount.lt(BigInt.fromI32(5))) {
    let reserve0USD = pair.reserve0.times(price0)
    let reserve1USD = pair.reserve1.times(price1)
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
      if (reserve0USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve1USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
  }

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedBNB.times(bundle.bnbPrice)
  let price1 = token1.derivedBNB.times(bundle.bnbPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
