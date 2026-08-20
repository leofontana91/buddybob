package com.buddybob.robot.robot

import java.util.concurrent.atomic.AtomicInteger

/** Incremental request id for OrionStar SDK log tracing. */
object ReqId {
    private val counter = AtomicInteger(1)
    fun next(): Int = counter.getAndIncrement()
}
