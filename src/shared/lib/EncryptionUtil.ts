// lib/encryption.js - 修复版本
const crypto = require('crypto');

const SECRET = 'secret_zhesheng_!@#$%Bsjaldffads'; // 确保这是32字节
const REQUEST_TIMEOUT = 300;// 单位秒，5分钟失效

class EncryptionUtil {

    /**
     * 生成随机密钥
     */
    static generateRandomKey(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * 生成MD5哈希
     */
    static generateMD5(data) {
        return crypto.createHash('md5').update(data).digest('hex');
    }

    /**
     * 生成最终加密密钥 - 修复版本
     */
    static generateFinalKey(randomKey) {
        const combined = SECRET + randomKey;
        // 使用SHA256哈希确保密钥长度为32字节
        return crypto.createHash('sha256').update(combined).digest();
    }

    /**
     * AES加密 - 修复版本
     */
    static encrypt(data, key) {
        try {
            // 确保密钥是Buffer且长度为32字节
            let keyBuffer;
            if (Buffer.isBuffer(key)) {
                keyBuffer = key;
            } else {
                keyBuffer = Buffer.from(key, 'utf8');
            }

            // 如果密钥不是32字节，使用SHA256哈希
            if (keyBuffer.length !== 32) {
                keyBuffer = crypto.createHash('sha256').update(keyBuffer).digest();
            }

            const cipher = crypto.createCipheriv('aes-256-ecb', keyBuffer, Buffer.alloc(0));
            let encrypted = cipher.update(data, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            return encrypted;
        } catch (error) {
            throw new Error('加密失败: ' + error.message);
        }
    }

    /**
     * AES解密 - 修复版本
     */
    static decrypt(encryptedData, key) {
        try {
            // 确保密钥是Buffer且长度为32字节
            let keyBuffer;
            if (Buffer.isBuffer(key)) {
                keyBuffer = key;
            } else {
                keyBuffer = Buffer.from(key, 'utf8');
            }

            // 如果密钥不是32字节，使用SHA256哈希
            if (keyBuffer.length !== 32) {
                keyBuffer = crypto.createHash('sha256').update(keyBuffer).digest();
            }

            const decipher = crypto.createDecipheriv('aes-256-ecb', keyBuffer, Buffer.alloc(0));
            let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            throw new Error('解密失败: ' + error.message);
        }
    }

    /**
     * 加密请求数据
     */
    static encryptRequest(data) {
        try {
            // 添加时间戳
            data.time = Math.floor(Date.now() / 1000);

            const jsonData = JSON.stringify(data);
            const randomKey = this.generateRandomKey(8);
            const finalKey = this.generateFinalKey(randomKey); // 这里返回的是Buffer

            // 加密数据
            const encryptedData = this.encrypt(jsonData, finalKey);

            // 生成哈希校验
            const hash = this.generateMD5(jsonData);

            // 组合三段数据: 随机密钥(8) + 哈希(32) + 密文
            return randomKey + hash + encryptedData;
        } catch (error) {
            console.error('加密请求失败:', error);
            throw new Error('请求加密失败: ' + error.message);
        }
    }

    /**
     * 解密并验证请求
     */
    static decryptRequest(encryptedString) {
        try {
            // 解析三段数据
            if (encryptedString.length < 40) {
                throw new Error('无效的加密字符串');
            }

            const randomKey = encryptedString.substring(0, 8);
            const receivedHash = encryptedString.substring(8, 40);
            const encryptedData = encryptedString.substring(40);

            const finalKey = this.generateFinalKey(randomKey);

            // 解密数据
            const decryptedData = this.decrypt(encryptedData, finalKey);

            // 验证哈希
            const calculatedHash = this.generateMD5(decryptedData);
            if (calculatedHash !== receivedHash) {
                throw new Error('数据被篡改');
            }

            // 解析JSON数据
            const data = JSON.parse(decryptedData);

            // 验证时间戳
            if (!data.time) {
                throw new Error('缺少时间戳字段');
            }

            const requestTime = parseInt(data.time);
            const currentTime = Math.floor(Date.now() / 1000);

            if (Math.abs(currentTime - requestTime) > REQUEST_TIMEOUT) { // 5分钟
                throw new Error('请求已过期');
            }

            return data;
        } catch (error) {
            console.error('解密请求失败:', error);
            throw new Error('请求解密失败: ' + error.message);
        }
    }
}

module.exports = EncryptionUtil;