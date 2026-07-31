import { Module } from '@nestjs/common'
import { HttpBridgeController } from './http-bridge.controller'

@Module({
  controllers: [HttpBridgeController],
})
export class HttpBridgeModule {}
