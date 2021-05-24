const Web3 = require('web3');

export class CommonUtil {
    
    public static getNumber(value) {
        const fromWeiValue = Web3.utils.fromWei(value);
        console.log("VALUE BEFORE :" + value);
        console.log("NEXT VALUE" + fromWeiValue);
        const num = Number(fromWeiValue);
        return Math.round(num * 100) / 100;
    }

}