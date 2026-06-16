package com.promptmuse.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

import android.content.Context
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  companion object {
      var appContext: Context? = null
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    appContext = this
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    
    // Hide system bars for immersive fullscreen
    val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
    windowInsetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
  }
}
