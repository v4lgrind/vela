package cloud.valgrind.vela

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpdateApkCheckTest {

    private val pkg = "cloud.valgrind.vela"

    @Test
    fun acceptsANewerBuildOfTheSameApp() {
        assertNull(UpdateApkCheck.rejectReason(pkg, 10400, pkg, 10500))
    }

    @Test
    fun rejectsAFileThatIsNotAnApk() {
        assertEquals("invalid_apk", UpdateApkCheck.rejectReason(pkg, 10400, null, null))
    }

    @Test
    fun rejectsAnotherApp() {
        assertEquals("wrong_package", UpdateApkCheck.rejectReason(pkg, 10400, "com.example.other", 99999))
    }

    @Test
    fun rejectsTheSameOrAnOlderVersion() {
        assertEquals("not_newer", UpdateApkCheck.rejectReason(pkg, 10400, pkg, 10400))
        assertEquals("not_newer", UpdateApkCheck.rejectReason(pkg, 10400, pkg, 10300))
    }
}
