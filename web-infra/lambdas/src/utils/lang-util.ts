
// should this utility be a common npm module

/**
 * A simple object holding a key/value pair.
 * This data structure is used extensively in AWS Lambda io formats
 */
export interface KeyValue {
    /** an optional key */
    key?: string;
    /** a string value */
    value: string;
}

/**
 * Creates an object from the provided 'key' and 'value'
 * @param key 
 * @param value 
 * @returns an object with the provided values for 'key' and 'value' props
 */
export function kv(key: string | undefined, value: string): KeyValue {
    if (key === undefined) {
        return { value }
    }

    return { key, value }
}

/**
 * Embeds the result of kv() in a single element array
 * @param key
 * @param value 
 * @returns
 */
export function kvArr(key: string | undefined, value: string): [KeyValue] {
    return [kv(key, value)]
}

/**
 * A utility function for returning the 'value' property from the first object of an array
 *
 * @param arr an array with at least one element
 * @returns the 'value' property from the first element of an array (which is supposed to be an object)
 */
export function i0v(arr: KeyValue[]) {
    // We don't know what we get from the event json, check it
    if (!Array.isArray(arr)) {
        throw new TypeError(`Expected an array but got ${arr}`)
    }

    if (arr.length === 0) {
        throw new RangeError(`Did not expect to get an array with zero elements`)
    }

    if (typeof arr[0].value !== 'string') {
        throw new TypeError(`Expected a string for the 'value' prop but got ${arr[0].value}`)
    }

    return arr[0].value
}

export function i0or(arr: KeyValue[], or: string) {
    if (arr) {
        if (arr[0] && arr[0].value) {
            return arr[0].value
        }
    }
    return or
}
export function randomInteger(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
